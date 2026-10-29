import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import ts from "typescript"
import "@angular/compiler"
import { HttpErrorResponse, HttpHeaders, HttpRequest } from "@angular/common/http"
import { createEnvironmentInjector, Injector, runInInjectionContext } from "@angular/core"
import { FormsModule } from "@angular/forms"
import { Router } from "@angular/router"
import { NEVER, Subject, of, throwError } from "rxjs"
import { TimeoutError } from "rxjs"

const root = new URL("../src/app/", import.meta.url)
const temporary = await mkdtemp(join(process.cwd(), ".chatbert-test-"))

async function compile(sourceUrl, outputName, replacements = []) {
  const source = await readFile(sourceUrl, "utf8")
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      experimentalDecorators: true,
    },
  })
  const output = replacements.reduce(
    (text, [from, to]) => text.replaceAll(from, to),
    outputText,
  )
  const path = join(temporary, outputName)
  await writeFile(path, output)
  return pathToFileURL(path)
}

try {
  const variablesUrl = await compile(new URL("core/api/auth/variables.ts", root), "variables.mjs")
  const tokenStoreUrl = await compile(
    new URL("core/auth/token-store.service.ts", root),
    "token-store.service.mjs",
    [["../models/data", "./data.mjs"]],
  )
  const dataUrl = await compile(new URL("core/models/data.ts", root), "data.mjs")
  const interceptorUrl = await compile(
    new URL("core/auth/auth.interceptor.ts", root),
    "auth.interceptor.mjs",
    [["./token-store.service", "./token-store.service.mjs"]],
  )
  const serviceUrl = await compile(
    new URL("core/api/chat.service.ts", root),
    "chat.service.mjs",
    [
      ["./auth/variables", "./variables.mjs"],
      ["../auth/auth.interceptor", "./auth.interceptor.mjs"],
    ],
  )
  const componentUrl = await compile(
    new URL("shared/chatbert/chatbert.component.ts", root),
    "chatbert.component.mjs",
    [
      ["../../core/api/chat.service", "./chat.service.mjs"],
      // This logic-only injector has no application render manager.
      ["afterEveryRender({", "((callback) => { globalThis.chatbertAfterRender = callback })({"],
    ],
  )

  const { BASE_PATH } = await import(variablesUrl)
  const { TokenStore } = await import(tokenStoreUrl)
  const { SKIP_AUTH, authInterceptor } = await import(interceptorUrl)
  const { ChatService, validateChatMessage } = await import(serviceUrl)
  const { default: ChatbertComponent } = await import(componentUrl)

  const dependencies = ChatbertComponent.\u0275cmp.dependencies
  const componentImports = typeof dependencies === "function" ? dependencies() : dependencies
  assert.ok(componentImports.includes(FormsModule), "Chatbert needs FormsModule so ngSubmit handles submission without navigating")

  assert.equal(validateChatMessage("   "), "empty")
  assert.equal(validateChatMessage("x".repeat(1001)), "too-long")
  assert.equal(validateChatMessage("hello\u0000world"), "invalid-characters")
  assert.equal(validateChatMessage("x".repeat(1000)), null)
  assert.equal(validateChatMessage("  How do I log in?  "), null)

  const captured = []
  const http = {
    post: (url, body, options) => {
      captured.push({ url, body, options })
      return of({ reply: "FAQ answer", sources: ["account-setup"], fallback: true, mode: "faq" })
    },
  }
  const serviceInjector = createEnvironmentInjector(
    [
      { provide: (await import("@angular/common/http")).HttpClient, useValue: http },
      { provide: BASE_PATH, useValue: "/api" },
    ],
    Injector.NULL,
  )
  const service = runInInjectionContext(serviceInjector, () => new ChatService())
  let result
  service.sendMessage("  How do I create an account?  ").subscribe((value) => (result = value))
  assert.equal(captured[0].url, "/api/chat/message")
  assert.deepEqual(captured[0].body, { message: "How do I create an account?" })
  assert.deepEqual(Object.keys(captured[0].body), ["message"])
  assert.equal(captured[0].options.headers["Content-Type"], "application/json")
  assert.equal(captured[0].options.context.get(SKIP_AUTH), true)
  assert.equal(result.mode, "faq")
  assert.equal(result.fallback, true)

  let interceptedRequest
  let clearedToken = false
  const interceptorInjector = createEnvironmentInjector(
    [
      { provide: TokenStore, useValue: { accessToken: () => "should-not-send", clear: () => (clearedToken = true) } },
      { provide: Router, useValue: { navigate: () => { throw new Error("Public 401 must not redirect") } } },
    ],
    Injector.NULL,
  )
  const publicRequest = new HttpRequest("POST", captured[0].url, captured[0].body, {
    headers: new HttpHeaders(captured[0].options.headers),
    context: captured[0].options.context,
  })
  runInInjectionContext(interceptorInjector, () =>
    authInterceptor(publicRequest, (request) => {
      interceptedRequest = request
      return of("ok")
    }).subscribe(),
  )
  assert.equal(interceptedRequest.headers.has("Authorization"), false)
  assert.equal(clearedToken, false)

  const normalRequest = new HttpRequest("GET", "/api/private")
  runInInjectionContext(interceptorInjector, () =>
    authInterceptor(normalRequest, (request) => {
      interceptedRequest = request
      return of("ok")
    }).subscribe(),
  )
  assert.equal(interceptedRequest.headers.get("Authorization"), "Bearer should-not-send")

  let activeResponse = of({ reply: "Gemini answer", sources: [], fallback: false, mode: "gemini" })
  const sent = []
  const fakeChatService = {
    sendMessage: (message) => {
      sent.push(message)
      return activeResponse
    },
  }
  const componentInjector = createEnvironmentInjector(
    [{ provide: ChatService, useValue: fakeChatService }],
    Injector.NULL,
  )
  const component = runInInjectionContext(componentInjector, () => new ChatbertComponent())
  component.draft = "How do I sign in?"
  component.send()
  assert.equal(sent.length, 1)
  assert.equal(component.messages.at(-2).role, "user")
  assert.equal(component.messages.at(-1).text, "Gemini answer")
  assert.equal(component.messages.at(-1).mode, "gemini")
  assert.equal(component.messages.at(-1).fallback, false)
  assert.equal(component.draft, "")

  activeResponse = of({
    reply: "I don’t have approved information to answer that question.",
    sources: [],
    fallback: true,
    mode: "faq",
  })
  component.draft = "Can you show my holdings?"
  component.send()
  assert.equal(component.messages.at(-1).mode, "faq")
  assert.equal(component.messages.at(-1).fallback, true)

  const inFlight = new Subject()
  fakeChatService.sendMessage = (message) => {
    sent.push(message)
    return inFlight
  }
  component.draft = "A pending question"
  const beforeDuplicate = sent.length
  component.send()
  component.send()
  assert.equal(sent.length, beforeDuplicate + 1)
  assert.equal(component.pending(), true)
  inFlight.next({ reply: "Done", sources: [], fallback: true, mode: "faq" })
  assert.equal(component.pending(), false)

  component.draft = ""
  component.send()
  assert.match(component.validationMessage, /Type a message/)
  component.draft = "z".repeat(1001)
  component.send()
  assert.match(component.validationMessage, /1000 characters/)

  fakeChatService.sendMessage = () => throwError(() => new HttpErrorResponse({ status: 400 }))
  component.draft = "bad input"
  component.send()
  assert.match(component.validationMessage, /check your message/i)
  assert.equal(component.draft, "bad input")

  fakeChatService.sendMessage = () => throwError(() => new HttpErrorResponse({
    status: 429,
    headers: new HttpHeaders({ "Retry-After": "7" }),
  }))
  component.draft = "please retry later"
  component.send()
  assert.equal(component.cooldownSeconds(), 7)
  assert.equal(component.draft, "please retry later")
  assert.match(component.validationMessage, /too many requests/i)

  component.ngOnDestroy()
  component.cooldownSeconds.set(0)
  fakeChatService.sendMessage = () => throwError(() => new HttpErrorResponse({ status: 0 }))
  component.draft = "network retry"
  component.send()
  assert.match(component.validationMessage, /temporarily unavailable/i)
  assert.equal(component.draft, "network retry")

  fakeChatService.sendMessage = () => throwError(() => new TimeoutError())
  component.send()
  assert.match(component.validationMessage, /temporarily unavailable/i)

  fakeChatService.sendMessage = () => throwError(() => new HttpErrorResponse({ status: 500 }))
  component.send()
  assert.match(component.validationMessage, /temporarily unavailable/i)

  component.clearConversation()
  assert.equal(component.messages.length, 1)
  assert.match(component.messages[0].text, /Hi, I’m Chatbert/)
  assert.equal(component.draft, "")

  const componentSource = await readFile(new URL("shared/chatbert/chatbert.component.ts", root), "utf8")
  assert.match(componentSource, /\{\{ message\.text \}\}/)
  assert.doesNotMatch(componentSource, /innerHTML|\[innerHTML\]/i)
  assert.match(componentSource, /aria-label="Close Chatbert"/)
  assert.match(componentSource, /keydown\.escape/)
  assert.match(componentSource, /event\.shiftKey/)

  serviceInjector.destroy()
  interceptorInjector.destroy()
  componentInjector.destroy()
  const list = { scrollTop: 0, scrollHeight: 500 }
  component.messageList = { nativeElement: list }
  globalThis.chatbertAfterRender.write()
  assert.equal(list.scrollTop, 500, "The registered post-render callback scrolls the rendered message list")
  component.scrollToLatest()
  assert.equal(list.scrollTop, 500, "Opening the chat scrolls to the latest message")
  list.scrollTop = 100
  component.scrollToLatest()
  assert.equal(list.scrollTop, 100, "Unrelated renders must not interrupt reading older messages")
  component.messages.push({ role: "user", text: "Another question" })
  list.scrollHeight = 600
  component.scrollToLatest()
  assert.equal(list.scrollTop, 600, "A new user message scrolls after rendering")
  component.messages.push({ role: "assistant", text: "Another reply" })
  list.scrollHeight = 800
  component.scrollToLatest()
  assert.equal(list.scrollTop, 800, "A new assistant message scrolls after rendering")
  list.scrollTop = 100
  component.pending.set(!component.pending())
  component.scrollToLatest()
  assert.equal(list.scrollTop, 800, "Pending indicator changes scroll into view")
  component.messageList = undefined
  component.scrollToLatest()
  component.messageList = { nativeElement: list }
  list.scrollTop = 0
  component.scrollToLatest()
  assert.equal(list.scrollTop, 800, "Reopening the chat restores the latest messages")

  console.log("Passed: Chatbert API contract, public interceptor opt-out, validation, FAQ/Gemini display, retries, cooldowns, text-only rendering, and message auto-scroll.")
} finally {
  delete globalThis.chatbertAfterRender
  await rm(temporary, { recursive: true, force: true })
}
