export const APP_ROLES = ["USER", "MODERATOR", "MANAGER", "ADMIN", "SUPER_ADMIN"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const PERMISSIONS = [
  "users.view", "users.edit", "users.ban",
  "rooms.view", "rooms.manage", "rooms.kick", "rooms.ban",
  "messages.view", "messages.search", "messages.media_view", "messages.moderate",
  "wallet.view", "transactions.view", "refunds.manage",
  "gifts.manage", "vip.manage", "store.manage", "agencies.manage",
  "banners.manage", "events.manage", "reports.manage", "staff.manage",
  "settings.manage", "audit_logs.view", "support.manage", "analytics.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export type Locale = "ar" | "en";
export type RoomStatus = "active" | "locked" | "closed";
export type SeatStatus = "empty" | "occupied" | "locked" | "reserved";
export type MessageType = "text" | "image" | "voice" | "gif" | "system" | "gift" | "file";

export const messages = {
  ar: {
    appName: "JEHOO CHAT",
    dashboard: "لوحة التحكم",
    users: "المستخدمون",
    rooms: "الغرف الصوتية",
    messages: "مراقبة المحادثات",
    reports: "البلاغات",
    settings: "الإعدادات",
    signIn: "تسجيل الدخول",
    signOut: "تسجيل الخروج",
    loading: "جارٍ التحميل…",
    accessDenied: "ليس لديك صلاحية للوصول إلى هذه الصفحة.",
    configurationRequired: "إعداد Supabase غير مكتمل.",
    dashboardSubtitle: "إدارة المنصة ومتابعة نشاطها",
    totalUsers: "إجمالي المستخدمين",
    activeRooms: "الغرف النشطة",
    securityNotice: "تُفحص الصلاحيات في قاعدة البيانات، وليس في الواجهة فقط.",
  },
  en: {
    appName: "JEHOO CHAT",
    dashboard: "Dashboard",
    users: "Users",
    rooms: "Voice Rooms",
    messages: "Chat Monitoring",
    reports: "Reports",
    settings: "Settings",
    signIn: "Sign in",
    signOut: "Sign out",
    loading: "Loading…",
    accessDenied: "You do not have permission to access this page.",
    configurationRequired: "Supabase configuration is incomplete.",
    dashboardSubtitle: "Manage the platform and review activity",
    totalUsers: "Total users",
    activeRooms: "Active rooms",
    securityNotice: "Permissions are enforced by the database, not just the UI.",
  },
} as const;

export function t(locale: Locale, key: keyof typeof messages.ar): string {
  return messages[locale][key];
}
