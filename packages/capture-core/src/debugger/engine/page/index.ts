import { installActionAndNavigationCapture } from "./actions"
import { installConsoleCapture } from "./console"
import { INSTALL_FLAG } from "./constants"
import { createPageDiagnostics } from "./diagnostics"
import { createEventQueue } from "./event-queue"
import { installNetworkCapture } from "./network"
import { createStringifyValue } from "./serializer"
import type { ConsoleLevel } from "./types"
import { createNonFatalReporter, truncate } from "./utils"

export function installDebuggerPageRuntime(): void {
  const scope = window as Window & {
    [INSTALL_FLAG]?: boolean
  }

  if (scope[INSTALL_FLAG]) {
    return
  }

  scope[INSTALL_FLAG] = true

  const diagnostics = createPageDiagnostics(window)
  const reporter = diagnostics.createReporter(createNonFatalReporter())
  const { enqueueEvent, flushEventQueue } = createEventQueue({
    recordQueuedEvent: diagnostics.recordQueuedEvent,
    recordFlushedBatch: diagnostics.recordFlushedBatch,
  })
  const stringifyValue = createStringifyValue(reporter)

  const postAction = (
    actionType: string,
    target: string | undefined,
    metadata?: Record<string, unknown>
  ) => {
    diagnostics.recordActionEvent()
    enqueueEvent({
      kind: "action",
      timestamp: Date.now(),
      actionType,
      target,
      metadata,
    })
  }

  const postConsole = (level: ConsoleLevel, args: unknown[]) => {
    diagnostics.recordConsoleEvent()
    const serializedArgs: string[] = []
    for (const arg of args) {
      serializedArgs.push(stringifyValue(arg))
    }

    enqueueEvent({
      kind: "console",
      timestamp: Date.now(),
      level,
      message: truncate(serializedArgs.join(" ")),
      metadata: {
        argumentCount: args.length,
      },
    })
  }

  const postNetwork = (payload: {
    method: string
    url: string
    status?: number
    duration?: number
    requestHeaders?: Record<string, string>
    responseHeaders?: Record<string, string>
    requestBody?: string
    responseBody?: string
  }) => {
    diagnostics.recordNetworkEvent(payload.url)
    enqueueEvent({
      kind: "network",
      timestamp: Date.now(),
      ...payload,
    })
  }

  installActionAndNavigationCapture({
    postAction,
  })

  installConsoleCapture({
    reporter,
    postConsole,
  })

  try {
    installNetworkCapture({
      diagnostics,
      reporter,
      postNetwork,
    })
  } catch (error) {
    reporter.reportNonFatalError(
      "Failed to install network capture in debugger runtime",
      error
    )
  }

  const flushOnPageHide = () => {
    flushEventQueue()
  }

  window.addEventListener("pagehide", flushOnPageHide, {
    capture: true,
  })

  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "hidden") {
        flushEventQueue()
      }
    },
    {
      capture: true,
      passive: true,
    }
  )

  // Capture uncaught exceptions
  window.addEventListener(
    "error",
    (event) => {
      const error = event.error
      if (error instanceof Error) {
        postConsole("error", [error])
      } else {
        const errorMsg = event.message || "Unknown error"
        const locationInfo = event.filename
          ? ` at ${event.filename}:${event.lineno}:${event.colno}`
          : ""
        postConsole("error", [`Uncaught ${errorMsg}${locationInfo}`])
      }
    },
    { capture: true }
  )

  // Capture unhandled promise rejections
  window.addEventListener(
    "unhandledrejection",
    (event) => {
      const reason = event.reason
      if (reason instanceof Error) {
        postConsole("error", [reason])
      } else if (typeof reason === "string") {
        postConsole("error", [`Unhandled Rejection: ${reason}`])
      } else {
        postConsole("error", ["Unhandled Rejection:", reason])
      }
    },
    { capture: true }
  )
}
