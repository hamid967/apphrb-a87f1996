import type { ComponentType } from "react";
import { template as subscriptionApproval } from "./subscription-approval";
import { template as subscriptionRejection } from "./subscription-rejection";
import { template as subscriptionExpiry } from "./subscription-expiry";
import { template as adminAlert } from "./admin-alert";
import { template as applicationUpdate } from "./application-update";

export interface TemplateEntry {
  component: ComponentType<any>;
  subject: string | ((data: Record<string, any>) => string);
  displayName?: string;
  previewData?: Record<string, any>;
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string;
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 *
 * Example:
 *   import { template as welcomeTemplate } from './welcome'
 *   // then add to TEMPLATES: 'welcome': welcomeTemplate
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  "subscription-approval": subscriptionApproval,
  "subscription-rejection": subscriptionRejection,
  "subscription-expiry": subscriptionExpiry,
  "admin-alert": adminAlert,
  "application-update": applicationUpdate,
};
