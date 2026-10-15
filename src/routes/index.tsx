import { createFileRoute } from "@tanstack/react-router";
import { Globe2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Olá, mundo!" },
      { name: "description", content: "Um pequeno começo. Um mundo de possibilidades." },
      { property: "og:title", content: "Olá, mundo!" },
      { property: "og:description", content: "Um pequeno começo. Um mundo de possibilidades." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="hello-page">
      <div className="hello-content">
        <div className="hello-symbol" aria-hidden="true"><Globe2 size={32} strokeWidth={1.5} /></div>
        <h1>Olá, mundo<span>!</span></h1>
        <p>Um pequeno começo.<br />Um mundo de possibilidades.</p>
      </div>
      <footer className="hello-footer">FEITO COM SIMPLICIDADE</footer>
    </main>
  );
}
