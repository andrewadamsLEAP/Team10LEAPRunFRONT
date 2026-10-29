import { catchError, defaultIfEmpty, from, map, Observable, of, switchMap, timeout } from "rxjs"
import type { AnalyticsValue, TrendMetric } from "./analytics-api.service"

export type ReportResult = {
	id: string
	title: string
	description: string
	loading: boolean
	data: AnalyticsValue
	image: Blob | null
	error: string
	metric?: TrendMetric
}
export type ReportRequest = Pick<ReportResult, "id" | "title" | "description"> & {
	request: Observable<AnalyticsValue | Blob>
	metric?: TrendMetric
}

export function analyticsError(error: unknown): string {
	const response = error as { name?: string; status?: number; error?: { name?: string; detail?: unknown; message?: string }; message?: string }
	const detail = response?.error?.detail
	if (response?.name === "TimeoutError" || response?.error?.name === "TimeoutError") {
		return "The warehouse did not respond within 20 seconds. Its database connection or query may be blocked. Check warehouse readiness and ETL; retry after the backend is healthy."
	}
	if (response?.status === 403) return "You do not have permission to view this report."
	if (response?.status === 401) return "Your session has expired. Please sign in again."
	if (response?.status === 0) return "Cannot reach analytics. Check that Python is running on port 5000."
	if (response?.status === 502 || response?.status === 503 || response?.status === 504) {
		return "The analytics warehouse is unavailable. Check the Python database connection, query timeout, and ETL status."
	}
	if (response?.status === 404 && (!detail || detail === "Not Found")) {
		return "Analytics endpoint not found. Check Python on port 5000 and restart Angular after proxy changes."
	}
	if (typeof detail === "string") return detail
	if (Array.isArray(detail)) return detail.map((item: { msg?: string }) => item.msg || "Invalid filter").join("; ")
	return response?.error?.message || response?.message || "Unable to load this report. Please try again."
}

// PNG errors arrive as blobs in HttpClient; decode FastAPI's JSON detail too.
export function reportFailure(error: unknown): Observable<string> {
	const response = error as { error?: unknown }
	if (response?.error instanceof Blob) {
		return from(response.error.text()).pipe(
			map((text) => {
				try { return analyticsError({ ...response, error: JSON.parse(text) }) }
				catch { return analyticsError(error) }
			}),
			catchError(() => of(analyticsError(error))),
		)
	}
	return of(analyticsError(error))
}

export function loadReport(report: ReportRequest): Observable<ReportResult> {
	return report.request.pipe(
		timeout({ first: 20000 }),
		map((value): ReportResult => ({
			id: report.id, title: report.title, description: report.description, loading: false,
			metric: report.metric,
			data: value instanceof Blob ? null : value,
			image: value instanceof Blob ? value : null, error: "",
		})),
		defaultIfEmpty({
			id: report.id, title: report.title, description: report.description,
			loading: false, data: null, image: null, error: "Analytics completed without returning a response.",
		}),
		catchError((error: unknown) => reportFailure(error).pipe(
			switchMap((message) => of({
				id: report.id, title: report.title, description: report.description,
				loading: false, data: null, image: null, error: message,
			})),
		)),
	)
}

export function orderPageInfo(data: AnalyticsValue): { count: number; total: number | null } {
	if (Array.isArray(data)) return { count: data.length, total: null }
	if (data && typeof data === "object") {
		const rows = [data['orders'], data['items'], data['data']].find(Array.isArray)
		const total = data['total_orders'] ?? data['total']
		return {
			count: rows?.length ?? 0,
			total: typeof total === "number" ? total : null,
		}
	}
	return { count: 0, total: null }
}
