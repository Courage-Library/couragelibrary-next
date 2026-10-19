import React from "react";
import { Bookmark, BookOpen, Zap } from "lucide-react";
import { Container } from "@/components/ui/layout";
import { Card, CardBody, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";

export const revalidate = 60;

// UX-2b.3 (F-01): every card links to a route that works today. Practice here draws on the questions a student
// got wrong in mocks; topic-by-topic practice sessions do not exist yet, so nothing below promises them.
const CARDS = [
  {
    id: "drill",
    icon: Zap,
    title: "Drill your mistakes",
    description:
      "Pick 5 to 20 questions from your mistakes, highest priority first. Answer one correctly twice in a row in a drill and it counts as mastered.",
    href: "/mistakes/drill",
    cta: "Start a drill",
    variant: "primary" as const,
  },
  {
    id: "bookmarked",
    icon: Bookmark,
    title: "Bookmarked mistakes",
    description: "Go back to the mistakes you bookmarked and review their solutions.",
    href: "/mistakes?bookmarked=true",
    cta: "Open bookmarked mistakes",
    variant: "secondary" as const,
  },
];

export default async function PracticePage() {
  return (
    <Container className="flex flex-col gap-8 py-8 lg:py-12">
      <header className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-h1 font-bold text-fg">Practice</h1>
        <p className="text-body text-fg-secondary">
          Practise the questions you got wrong in mock tests until you get them right.
        </p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-2">
        {CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <li key={c.id}>
              <Card className="h-full">
                <CardHeader>
                  <span
                    aria-hidden="true"
                    className="mb-2 flex size-12 items-center justify-center rounded-card bg-primary-50 text-primary-700"
                  >
                    <Icon className="size-6" />
                  </span>
                  <CardTitle as="h2">{c.title}</CardTitle>
                </CardHeader>
                <CardBody>
                  <CardDescription className="text-body">{c.description}</CardDescription>
                </CardBody>
                <CardFooter>
                  <ButtonLink href={c.href} variant={c.variant} fullWidth>
                    {c.cta}
                  </ButtonLink>
                </CardFooter>
              </Card>
            </li>
          );
        })}
      </ul>

      <p className="flex items-center gap-2 text-body-sm text-fg-secondary">
        <BookOpen aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
        No mistakes yet? Take a mock test first: every question you get wrong is saved for practice.
        <ButtonLink href="/mock-tests" variant="ghost" size="md" className="-my-2">
          Mock tests
        </ButtonLink>
      </p>
    </Container>
  );
}
