export type CalendarNavigationEvent = {
  event_type: string;
  description?: string | null;
};

export function calendarEventDestination(classId: number, event: CalendarNavigationEvent) {
  return event.event_type === "aac" || String(event.description || "").startsWith("[aac:")
    ? `/class/${classId}/admin/aac`
    : `/class/${classId}/calendar`;
}
