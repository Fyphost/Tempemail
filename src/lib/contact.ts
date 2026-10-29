export const contactTopics = ["general", "abuse", "premium", "privacy", "bug"] as const;
export type ContactTopic = (typeof contactTopics)[number];

export const contactTopicLabels: Record<ContactTopic, string> = {
  general: "General question",
  abuse: "Report abuse",
  premium: "Premium access",
  privacy: "Privacy or data request",
  bug: "Report a problem",
};
