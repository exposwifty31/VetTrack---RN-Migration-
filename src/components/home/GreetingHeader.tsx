/**
 * Greeting + localized date (README.md §2). The name renders inside an LTR
 * isolate (⁦…⁩) so Latin names sit correctly in the RTL sentence.
 */
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

function greetingKey(
  hour: number,
): "aurora.greetingMorning" | "aurora.greetingAfternoon" | "aurora.greetingEvening" {
  if (hour < 12) return "aurora.greetingMorning";
  if (hour < 18) return "aurora.greetingAfternoon";
  return "aurora.greetingEvening";
}

export function GreetingHeader({ name }: { name?: string }) {
  const { t, i18n } = useTranslation();
  const now = new Date();

  let dateLabel: string;
  try {
    dateLabel = new Intl.DateTimeFormat(i18n.language === "he" ? "he-IL" : "en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(now);
  } catch {
    dateLabel = now.toDateString();
  }

  const greeting = t(greetingKey(now.getHours()));
  // ⁦…⁩ = LRI…PDI (LTR isolate) around the Latin name.
  const title = name ? `${greeting}, ⁦${name}⁩` : greeting;

  return (
    <View className="px-[26px] pt-3">
      <Text className="font-rubik-bold text-[22px] text-foreground">{title}</Text>
      <Text className="mt-[1px] font-rubik text-[12.5px] text-muted">{dateLabel}</Text>
    </View>
  );
}
