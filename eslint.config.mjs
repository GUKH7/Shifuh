import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  ...nextCoreWebVitals,
  {
    ignores: [
      ".next/**",
      ".next-e2e/**",
      "node_modules/**",
      "next-env.d.ts",
    ],
  },
  {
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default eslintConfig;
