import { define } from "../utils.ts";

export default define.page(function App({ Component }) {
  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#093eaa" />
        <meta name="description" content="Comparte gastos con tu pareja, amigos o roomies de forma sencilla" />
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
        <style>{`
html,body{background-color:#0a0a0c;color:#f8fafc;margin:0}
.font-sans{font-family:"Inter",sans-serif}
.bg-background{background-color:#0a0a0c}
.min-h-screen{min-height:100vh}
.text-slate-100{color:#f1f5f9}
.modal-overlay{background-color:rgba(0,0,0,0.8);backdrop-filter:blur(4px)}
.custom-scrollbar::-webkit-scrollbar{width:4px}
.custom-scrollbar::-webkit-scrollbar-track{background:transparent}
.custom-scrollbar::-webkit-scrollbar-thumb{background:#333;border-radius:10px}
.group:hover .sidebar-action-btns{opacity:1!important}
`}</style>
        <title>A la par</title>
      </head>
      <body class="font-sans bg-background text-slate-100 min-h-screen">
        <Component />
        <script
          dangerouslySetInnerHTML={{
            __html: `
window.addEventListener('load',function(){
  if(!('serviceWorker' in navigator))return;
  navigator.serviceWorker.register('/sw.js').then(function(){
    if(caches&&caches.keys){
      caches.keys().then(function(names){
        var kept=['alapar-v1','alapar-build-v1','alapar-api-v1','alapar-html-v1'];
        names.forEach(function(n){if(kept.indexOf(n)===-1)caches.delete(n)});
      });
    }
  });
});
`,
          }}
        />
      </body>
    </html>
  );
});
