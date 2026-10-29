const backendHost = "http://54.80.207.176"

// Calls go directly to EC2 both locally and when the static app is deployed to S3.
export const API_V1_BASE_PATH = `${backendHost}:8085/api`
export const AUTH_BASE_PATH = `${backendHost}:3000`
export const ANALYTICS_BASE_PATH = `${backendHost}:5000`
