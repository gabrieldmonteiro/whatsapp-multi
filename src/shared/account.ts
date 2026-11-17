import { z } from 'zod';

export const ACCOUNT_COLORS = [
  'green',
  'teal',
  'blue',
  'violet',
  'pink',
  'red',
  'orange',
  'yellow',
  'gray',
] as const;

export const AccountSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(40),
  color: z.enum(ACCOUNT_COLORS),
  order: z.number().int().min(0),
  createdAt: z.iso.datetime(),
  keepAlive: z.boolean(),
  notifications: z.boolean(),
});
export type Account = z.infer<typeof AccountSchema>;

export const AccountCreateSchema = AccountSchema.pick({ name: true, color: true });
export type AccountCreate = z.infer<typeof AccountCreateSchema>;

export const AccountPatchSchema = AccountSchema.pick({
  name: true,
  color: true,
  keepAlive: true,
  notifications: true,
})
  .partial()
  .strict();
export type AccountPatch = z.infer<typeof AccountPatchSchema>;

export const MAX_ACCOUNTS = 10;
export const partitionFor = (id: string) => `persist:account-${id}` as const;

export const BoundsSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().min(0).max(16384),
  height: z.number().int().min(0).max(16384),
});
export type Bounds = z.infer<typeof BoundsSchema>;

export const ViewStateSchema = z.enum(['idle', 'loading', 'ready', 'error', 'crashed']);
export type ViewState = z.infer<typeof ViewStateSchema>;

export const ViewInfoSchema = z.object({
  id: z.uuid(),
  state: ViewStateSchema,
  unread: z.number().int().min(0).nullable(),
  errorCode: z.number().int().optional(),
});
export type ViewInfo = z.infer<typeof ViewInfoSchema>;
