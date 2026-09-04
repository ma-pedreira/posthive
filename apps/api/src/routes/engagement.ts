import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { withAuth, getUser, getWorkspaceId } from "../lib/auth/withAuth.js";

const ruleShape = z.object({
  accountId: z.string().min(1),
  name: z.string().min(1),
  keyword: z.string().min(1),
  matchType: z.enum(["partial", "whole_word"]).default("partial"),
  targetMode: z.enum(["any", "specific"]).default("any"),
  targetMediaId: z.string().optional(),
  publicReplyEnabled: z.boolean().default(true),
  publicReplyText: z.string().optional(),
  dmText: z.string().min(1),
  enabled: z.boolean().default(true),
});

const ruleBody = ruleShape.refine(
  (v) => v.targetMode !== "specific" || !!v.targetMediaId?.trim(),
  { message: "Debes indicar el ID de la publicación cuando eliges \"publicación específica\"", path: ["targetMediaId"] }
);

const patchBody = ruleShape.partial();

export async function engagementRoutes(app: FastifyInstance): Promise<void> {
  app.get("/engagement/rules", { preHandler: [withAuth] }, async (req, reply) => {
    const workspaceId = getWorkspaceId(req);
    const rules = await prisma.engagementRule.findMany({
      where: { workspaceId },
      include: { account: { select: { id: true, platform: true, displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ rules });
  });

  app.post("/engagement/rules", { preHandler: [withAuth] }, async (req, reply) => {
    const { id: userId } = getUser(req);
    const workspaceId = getWorkspaceId(req);
    const parsed = ruleBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const data = parsed.data;

    const account = await prisma.account.findFirst({
      where: { id: data.accountId, workspaceId, platform: "instagram" },
    });
    if (!account) return reply.status(400).send({ error: "La cuenta seleccionada debe ser una cuenta de Instagram conectada" });

    const rule = await prisma.engagementRule.create({
      data: { ...data, userId, workspaceId },
    });
    return reply.status(201).send({ rule });
  });

  app.patch("/engagement/rules/:id", { preHandler: [withAuth] }, async (req, reply) => {
    const workspaceId = getWorkspaceId(req);
    const { id } = req.params as { id: string };
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const existing = await prisma.engagementRule.findFirst({ where: { id, workspaceId } });
    if (!existing) return reply.status(404).send({ error: "Regla no encontrada" });

    const rule = await prisma.engagementRule.update({ where: { id }, data: parsed.data });
    return reply.send({ rule });
  });

  app.delete("/engagement/rules/:id", { preHandler: [withAuth] }, async (req, reply) => {
    const workspaceId = getWorkspaceId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.engagementRule.findFirst({ where: { id, workspaceId } });
    if (!existing) return reply.status(404).send({ error: "Regla no encontrada" });
    await prisma.engagementRule.delete({ where: { id } });
    return reply.status(204).send();
  });

  app.get("/engagement/rules/:id/logs", { preHandler: [withAuth] }, async (req, reply) => {
    const workspaceId = getWorkspaceId(req);
    const { id } = req.params as { id: string };
    const rule = await prisma.engagementRule.findFirst({ where: { id, workspaceId } });
    if (!rule) return reply.status(404).send({ error: "Regla no encontrada" });

    const logs = await prisma.engagementLog.findMany({
      where: { ruleId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return reply.send({ logs });
  });
}
