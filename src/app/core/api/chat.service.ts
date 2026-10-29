import { HttpClient, HttpContext } from "@angular/common/http"
import { inject, Injectable } from "@angular/core"
import { timeout } from "rxjs"
import { BASE_PATH } from "./auth/variables"
import { SKIP_AUTH } from "../auth/auth.interceptor"

export interface ChatRequest {
  message: string
}

export interface ChatResponse {
  reply: string
  sources: string[]
  fallback: boolean
  mode: "faq" | "gemini"
}

export type ChatValidationError =
  | "empty"
  | "too-long"
  | "too-many-bytes"
  | "invalid-characters"

export function validateChatMessage(message: string): ChatValidationError | null {
  const trimmed = message.trim()
  if (!trimmed) return "empty"
  if (trimmed.length > 1000) return "too-long"
  if (new TextEncoder().encode(trimmed).length > 4000) return "too-many-bytes"
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u.test(trimmed)) {
    return "invalid-characters"
  }
  return null
}

@Injectable({ providedIn: "root" })
export class ChatService {
  private readonly http = inject(HttpClient)
  private readonly apiBasePath = inject(BASE_PATH)

  sendMessage(message: string) {
    const body: ChatRequest = { message: message.trim() }
    return this.http
      .post<ChatResponse>(`${this.apiBasePath}/chat/message`, body, {
        headers: { "Content-Type": "application/json" },
        context: new HttpContext().set(SKIP_AUTH, true),
      })
      .pipe(timeout(15_000))
  }
}
