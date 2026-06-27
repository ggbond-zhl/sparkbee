import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const APNAuthenticationEnumSchema = z.enum(["CHAP","NONE","PAP","AUTO"]);

const OCPPInterfaceEnumSchema = z.enum(["Wired0","Wired1","Wired2","Wired3","Wireless0","Wireless1","Wireless2","Wireless3"]);

const OCPPTransportEnumSchema = z.enum(["JSON","SOAP"]);

const OCPPVersionEnumSchema = z.enum(["OCPP12","OCPP15","OCPP16","OCPP20"]);

const VPNEnumSchema = z.enum(["IKEv2","IPSec","L2TP","PPTP"]);

const APNSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "apn": z.string().max(512),
  "apnUserName": z.string().max(20).optional(),
  "apnPassword": z.string().max(20).optional(),
  "simPin": z.number().int().optional(),
  "preferredNetwork": z.string().max(6).optional(),
  "useOnlyPreferredNetwork": z.boolean().optional(),
  "apnAuthentication": APNAuthenticationEnumSchema
}).strict();

const VPNSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "server": z.string().max(512),
  "user": z.string().max(20),
  "group": z.string().max(20).optional(),
  "password": z.string().max(20),
  "key": z.string().max(255),
  "type": VPNEnumSchema
}).strict();

const NetworkConnectionProfileSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "apn": APNSchema.optional(),
  "ocppVersion": OCPPVersionEnumSchema,
  "ocppTransport": OCPPTransportEnumSchema,
  "ocppCsmsUrl": z.string().max(512),
  "messageTimeout": z.number().int(),
  "securityProfile": z.number().int(),
  "ocppInterface": OCPPInterfaceEnumSchema,
  "vpn": VPNSchema.optional()
}).strict();

export const SetNetworkProfileRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "configurationSlot": z.number().int(),
  "connectionData": NetworkConnectionProfileSchema
}).strict();
export type SetNetworkProfileRequest = z.infer<typeof SetNetworkProfileRequestSchema>;
