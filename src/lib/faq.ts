export interface FaqItem {
  question: string;
  answer: string;
  category: "Basics" | "Privacy & security" | "Limits" | "Developers";
}

export const faq: FaqItem[] = [
  {
    category: "Basics",
    question: "What is a temporary email address?",
    answer:
      "It is a real, working email address that you can use for a short time and then throw away. Use it for newsletters, free trials, downloads or one-off sign-ups, and keep your personal inbox free of spam.",
  },
  {
    category: "Basics",
    question: "Do I need to create an account?",
    answer:
      "No. Open the inbox and an address is created for you instantly. Your browser keeps a private session token for it. Optional accounts exist only for people who need several addresses or API keys.",
  },
  {
    category: "Basics",
    question: "How quickly do emails arrive?",
    answer:
      "As soon as the sending server delivers them. New messages are pushed to your browser over a live connection, so they appear without refreshing. If your network blocks live connections, the inbox checks for mail automatically every few seconds.",
  },
  {
    category: "Limits",
    question: "How long does an address last?",
    answer:
      "Each address has a visible countdown. When it reaches zero the address and all of its messages are deleted permanently. You can extend the lifetime from the inbox while you still need it, up to the maximum allowed for your plan.",
  },
  {
    category: "Privacy & security",
    question: "Can other people read my inbox?",
    answer:
      "Not just by knowing the address. Opening an inbox requires its secret session token, which only your browser (or your API client) has. Treat that token like a password: anyone who obtains your browser session or token could read the inbox until it expires.",
  },
  {
    category: "Privacy & security",
    question: "Is it safe to open emails here?",
    answer:
      "Messages are sanitized and displayed in a sandboxed frame where scripts, forms and plugins cannot run. Remote images, which senders use as tracking pixels, stay blocked until you choose to load them. Links open through a warning page that shows the real destination.",
  },
  {
    category: "Privacy & security",
    question: "What should I not use a temporary address for?",
    answer:
      "Anything you need to keep. Do not use it for banking, payments, government services, password recovery or any account you would be locked out of if you lost access. Once an address expires, it cannot be recovered.",
  },
  {
    category: "Limits",
    question: "Can I send or reply to emails?",
    answer:
      "No. Temporary inboxes are receive-only. This keeps the service from being used to send spam and avoids exposing your real identity.",
  },
  {
    category: "Limits",
    question: "Are attachments supported?",
    answer:
      "Yes, within size limits. Executables, scripts and other dangerous file types are blocked automatically, and every attachment is downloaded as a file rather than opened in the browser.",
  },
  {
    category: "Developers",
    question: "Can I use temporary inboxes in automated tests?",
    answer:
      "Yes. The REST API lets you create an inbox, wait for a message over Server-Sent Events or by polling, read its content and clean up afterwards. See the API documentation for examples.",
  },
];
