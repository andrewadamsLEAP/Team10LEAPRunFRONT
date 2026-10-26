import { HttpErrorResponse } from "@angular/common/http"
import { Component, ElementRef, OnDestroy, ViewChild, inject, signal } from "@angular/core"
import { FormsModule } from "@angular/forms"
import { ChatResponse, ChatService, validateChatMessage } from "../../core/api/chat.service"

interface ChatMessage {
  role: "user" | "assistant"
  text: string
  mode?: ChatResponse["mode"]
  fallback?: boolean
  sources?: string[]
}

const INTRODUCTION =
  "Hi, I’m Chatbert. I can help with approved instructions for using this site. Please don’t share passwords, account details, or financial information."

@Component({
  selector: "app-chatbert",
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (!isOpen()) {
      <button
        #launcher
        class="chatbert-launcher"
        type="button"
        aria-label="Open Chatbert website help"
        aria-controls="chatbert-panel"
        [attr.aria-expanded]="isOpen()"
        (click)="openChat()"
      >
        <span class="chatbert-launcher-icon" aria-hidden="true">✦</span>
        <span>Ask Chatbert</span>
      </button>
    } @else {
      <section
        id="chatbert-panel"
        class="chatbert-panel"
        role="dialog"
        aria-modal="false"
        aria-labelledby="chatbert-title"
        (keydown.escape)="closeChat()"
      >
        <header class="chatbert-header">
          <div class="chatbert-brand-mark" aria-hidden="true">✦</div>
          <div class="chatbert-heading">
            <h2 id="chatbert-title">Chatbert</h2>
            <span>Website help</span>
          </div>
          <button
            class="chatbert-icon-button"
            type="button"
            aria-label="Clear conversation"
            title="Clear conversation"
            [disabled]="pending()"
            (click)="clearConversation()"
          >↺</button>
          <button
            class="chatbert-icon-button"
            type="button"
            aria-label="Close Chatbert"
            (click)="closeChat()"
          >×</button>
        </header>

        <p class="chatbert-disclaimer">
          I can’t access accounts, make trades, or give investment advice. This chat is stateless, so name the topic again in follow-up questions.
        </p>

        <div class="chatbert-messages" role="log" aria-live="polite" aria-relevant="additions text" aria-label="Chat messages">
          @for (message of messages; track $index) {
            <article class="chatbert-message" [class.chatbert-user-message]="message.role === 'user'" [class.chatbert-assistant-message]="message.role === 'assistant'">
              <span class="chatbert-message-author">{{ message.role === 'user' ? 'You' : 'Chatbert' }}</span>
              <p>{{ message.text }}</p>
              @if (message.role === 'assistant' && message.mode) {
                <span class="chatbert-response-mode">
                  {{ message.fallback ? 'Fallback · ' : '' }}{{ message.mode === 'faq' ? 'FAQ answer' : 'Gemini answer' }}
                </span>
              }
            </article>
          }
          @if (pending()) {
            <div class="chatbert-pending" role="status" aria-label="Chatbert is preparing a response">
              <span></span><span></span><span></span><span class="visually-hidden">Chatbert is thinking…</span>
            </div>
          }
        </div>

        <form class="chatbert-composer" (ngSubmit)="send()">
          @if (validationMessage) {
            <p class="chatbert-error" role="alert">{{ validationMessage }}</p>
          }
          <label class="visually-hidden" for="chatbert-input">Your message</label>
          <textarea
            #messageInput
            id="chatbert-input"
            name="message"
            rows="2"
            maxlength="1000"
            [value]="draft"
            placeholder="Ask a question about using this site…"
            [disabled]="pending()"
            [attr.aria-describedby]="cooldownSeconds() > 0 ? 'chatbert-count chatbert-cooldown' : 'chatbert-count'"
            (input)="onInput($event)"
            (keydown)="onInputKeydown($event)"
          ></textarea>
          <div class="chatbert-composer-footer">
            <span id="chatbert-count">{{ draft.length }} / 1000</span>
            @if (cooldownSeconds() > 0) {
              <span id="chatbert-cooldown" class="chatbert-cooldown" role="status">Try again in {{ cooldownSeconds() }}s</span>
            }
            <button
              class="chatbert-send"
              type="submit"
              [disabled]="pending() || cooldownSeconds() > 0 || !draft.trim()"
              aria-label="Send message"
            >Send <span aria-hidden="true">↑</span></button>
          </div>
          <p class="chatbert-footnote">Don’t share private or financial information.</p>
        </form>
      </section>
    }
  `,
})
export default class ChatbertComponent implements OnDestroy {
  private readonly chatService = inject(ChatService)
  @ViewChild("messageInput") private messageInput?: ElementRef<HTMLTextAreaElement>
  @ViewChild("launcher") private launcher?: ElementRef<HTMLButtonElement>

  readonly isOpen = signal(false)
  readonly pending = signal(false)
  readonly cooldownSeconds = signal(0)
  readonly messages: ChatMessage[] = [{ role: "assistant", text: INTRODUCTION }]
  draft = ""
  validationMessage = ""
  private cooldownTimer?: ReturnType<typeof setInterval>

  openChat() {
    this.isOpen.set(true)
    setTimeout(() => this.messageInput?.nativeElement.focus())
  }

  closeChat() {
    this.isOpen.set(false)
    setTimeout(() => this.launcher?.nativeElement.focus())
  }

  onInput(event: Event) {
    this.draft = (event.target as HTMLTextAreaElement).value
    this.validationMessage = ""
  }

  onInputKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      this.send()
    }
  }

  send() {
    if (this.pending() || this.cooldownSeconds() > 0) return
    const message = this.draft.trim()
    const validationError = validateChatMessage(message)
    if (validationError) {
      this.validationMessage = this.validationText(validationError)
      return
    }

    this.validationMessage = ""
    this.pending.set(true)
    this.chatService.sendMessage(message).subscribe({
      next: (response) => {
        this.messages.push({ role: "user", text: message })
        this.messages.push({
          role: "assistant",
          text: response.reply,
          mode: response.mode,
          fallback: response.fallback,
          sources: response.sources,
        })
        if (this.draft.trim() === message) this.draft = ""
        this.pending.set(false)
      },
      error: (error: unknown) => {
        this.pending.set(false)
        this.validationMessage = this.requestError(error)
        if (error instanceof HttpErrorResponse && error.status === 429) {
          this.startCooldown(this.retryAfterSeconds(error))
        }
      },
    })
  }

  clearConversation() {
    if (this.pending()) return
    this.messages.splice(0, this.messages.length, { role: "assistant", text: INTRODUCTION })
    this.validationMessage = ""
    this.draft = ""
  }

  ngOnDestroy() {
    if (this.cooldownTimer) clearInterval(this.cooldownTimer)
  }

  private startCooldown(seconds: number) {
    if (this.cooldownTimer) clearInterval(this.cooldownTimer)
    this.cooldownSeconds.set(seconds)
    this.cooldownTimer = setInterval(() => {
      const remaining = this.cooldownSeconds() - 1
      this.cooldownSeconds.set(Math.max(0, remaining))
      if (remaining <= 0 && this.cooldownTimer) {
        clearInterval(this.cooldownTimer)
        this.cooldownTimer = undefined
      }
    }, 1000)
  }

  private retryAfterSeconds(error: HttpErrorResponse) {
    const header = error.headers.get("Retry-After")
    const seconds = header === null ? Number.NaN : Number(header)
    return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 60
  }

  private requestError(error: unknown) {
    if (!(error instanceof HttpErrorResponse)) {
      return "Chatbert is temporarily unavailable. Please try again manually."
    }
    if (error.status === 400) {
      return "Please check your message. It must contain 1–1000 characters and avoid unsupported control characters."
    }
    if (error.status === 429) {
      return "Chatbert is receiving too many requests right now. Please wait before trying again."
    }
    return "Chatbert is temporarily unavailable. Your message is still here so you can try again."
  }

  private validationText(error: NonNullable<ReturnType<typeof validateChatMessage>>) {
    switch (error) {
      case "empty":
        return "Type a message before sending."
      case "too-long":
        return "Messages can be up to 1000 characters."
      case "too-many-bytes":
        return "This message is too large to send. Shorten it and try again."
      case "invalid-characters":
        return "Please remove unsupported control characters from your message."
    }
  }
}
