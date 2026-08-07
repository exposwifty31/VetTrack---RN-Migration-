/**
 * Location section — the CANONICAL precedence surface stays server-side
 * (ADR-006: RFID never overrides a human room); this card only renders what
 * the detail read returns: room (human), free-text note, usual home, and the
 * taken-to note while checked out. All-empty renders the honest unknown line.
 */
import { Text } from "react-native";
import { useTranslation } from "react-i18next";

import { SectionCard } from "@/components/ui/SectionCard";
import type { EquipmentDetail } from "@/types/api";

import { KeyValueRow, SectionTitle } from "./DetailBits";

type LocationCardProps = Readonly<{
  detail: Pick<
    EquipmentDetail,
    "roomName" | "location" | "usuallyFoundHere" | "checkedOutLocation" | "custodyState"
  >;
}>;

export function LocationCard({ detail }: LocationCardProps) {
  const { t } = useTranslation();
  const checkedOut = detail.custodyState === "checked_out";
  const rows: { key: string; label: string; value: string }[] = [];

  if (detail.roomName) {
    rows.push({ key: "room", label: t("equipmentDetail.location.room"), value: detail.roomName });
  }
  if (detail.location) {
    rows.push({
      key: "freeText",
      label: t("equipmentDetail.location.freeText"),
      value: detail.location,
    });
  }
  if (detail.usuallyFoundHere) {
    rows.push({
      key: "usual",
      label: t("equipmentDetail.location.usuallyFoundHere"),
      value: detail.usuallyFoundHere,
    });
  }
  if (checkedOut && detail.checkedOutLocation) {
    rows.push({
      key: "takenTo",
      label: t("equipmentDetail.location.checkedOutTo"),
      value: detail.checkedOutLocation,
    });
  }

  return (
    <SectionCard>
      <SectionTitle title={t("equipmentDetail.location.title")} />
      {rows.length === 0 ? (
        <Text className="font-rubik text-[13px] text-muted">
          {t("equipmentDetail.location.unknown")}
        </Text>
      ) : (
        rows.map((row) => <KeyValueRow key={row.key} label={row.label} value={row.value} />)
      )}
    </SectionCard>
  );
}
