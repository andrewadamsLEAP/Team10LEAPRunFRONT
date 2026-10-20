module.exports = [
  {
    context: ["/api/v1"],
    target: "http://localhost:8085",
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