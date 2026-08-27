import { format } from "date-fns";

export function renderMessage(template: string, values: { clientName: string; appointmentAt: string }) {
  return template.replaceAll("{{clientName}}", values.clientName).replaceAll("{{appointmentAt}}", values.appointmentAt);
}

export function appointmentTime(iso: string) {
  return format(new Date(iso), "dd/MM HH:mm");
}