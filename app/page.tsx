"use client"
import {Hero} from "@/app/components/Hero";
import {Projects} from "@/app/components/Projects";
import {Contact} from "@/app/components/Contact";

export default function Home() {
  return (
      <div className="min-h-screen bg-bg font-sans text-text">
          <main className="mx-auto flex max-w-[1200px] flex-col gap-14 px-5 pt-12 pb-16">
              <Hero />
              <Projects />
              <Contact />
          </main>
      </div>
  );
}
