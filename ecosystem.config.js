module.exports = {
  apps: [
    {
      name: "vigiesaas",
      script: "npm",
      args: "start",
      cwd: "/opt/vigiesaas",
      env: { NODE_ENV: "production", PORT: 3000 },
    },
  ],
};
