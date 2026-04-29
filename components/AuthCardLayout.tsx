import { Head } from "fresh/runtime";
import type { ComponentChildren } from "preact";

interface AuthCardLayoutProps {
  pageTitle: string;
  children: ComponentChildren;
  centered?: boolean;
}

export default function AuthCardLayout(
  { pageTitle, children, centered = false }: AuthCardLayoutProps,
) {
  const cardClasses = centered
    ? "bg-surface border border-border-custom rounded-custom p-8 w-full max-w-md z-10 text-center"
    : "bg-surface border border-border-custom rounded-custom p-8 w-full max-w-md z-10";

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
      </Head>
      <main class="min-h-screen flex items-center justify-center p-6 bg-pattern">
        <div class="absolute inset-0 gradient-glow pointer-events-none" />
        <div class={cardClasses}>
          {children}
        </div>
      </main>
    </>
  );
}
