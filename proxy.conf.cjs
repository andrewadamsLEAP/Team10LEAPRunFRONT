module.exports = [
  {
    context: ["/analytics-api"],
    target: "http://54.80.207.176:5000",
    secure: false,
    changeOrigin: true,
    pathRewrite: {
      "^/analytics-api": "",
    },
  },
  {
    context: ["/api/v1"],
    target: "http://54.80.207.176:8085",
    secure: false,
    changeOrigin: true,
  },
  {
    context: ["/api"],
    target: "http://54.80.207.176:3000",
    secure: false,
    changeOrigin: true,
    pathRewrite: {
      "^/api": "",
    },
  },
]
