module.exports = [
  {
    context: ["/analytics-api"],
    target: "http://localhost:5000",
    secure: false,
    changeOrigin: true,
    pathRewrite: {
      "^/analytics-api": "",
    },
  },
  {
    context: ["/api/v1"],
    target: "http://localhost:8080",
    secure: false,
    changeOrigin: true,
  },
  {
    context: ["/api"],
    target: "http://localhost:3000",
    secure: false,
    changeOrigin: true,
    pathRewrite: {
      "^/api": "",
    },
  },
]