import { define } from "../utils.ts";

export default define.page(function App({ Component }) {
  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
        />
        <meta name="theme-color" content="#093eaa" />
        <meta
          name="description"
          content="Comparte gastos con tu pareja, amigos o roomies de forma sencilla"
        />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" type="image/svg+xml" href="/logo.svg" />
        <link rel="apple-touch-icon" href="/logo.svg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossorigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <style>
          {`
html,body{background-color:#0a0a0c;color:#f8fafc;margin:0;touch-action:manipulation}
.font-sans{font-family:"Inter",sans-serif}
`}
        </style>
        <title>A la par</title>
      </head>
      <body class="font-sans bg-background text-slate-100 min-h-screen">
        <Component />
        <script src="/sw-register.js" />
      </body>
    </html>
  );
});
