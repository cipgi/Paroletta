import { createRouter, authedQuery } from "./middleware";
import { z } from "zod";
import { patients, nextPatientId } from "./store";

export const patientsRouter = createRouter({
  list: authedQuery.query(async ({ ctx }) => patients.filter((p) => p.userId === ctx.user.id).sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime())),
  create: authedQuery.input(z.object({ aliasEta: z.string().max(50).optional(), noteAnonime: z.string().optional() })).mutation(async ({ ctx, input }) => {
    const patient = { id: nextPatientId(), userId: ctx.user.id, aliasEta: input.aliasEta ?? null, noteAnonime: input.noteAnonime ?? null, createdAt: new Date() };
    patients.push(patient); return patient;
  }),
  detail: authedQuery.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const patient = patients.find((p) => p.id === input.id); if (!patient) throw new Error("Patient not found"); if (patient.userId !== ctx.user.id) throw new Error("Unauthorized"); return patient;
  }),
  delete: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const index = patients.findIndex((p) => p.id === input.id); if (index < 0) throw new Error("Patient not found"); if (patients[index].userId !== ctx.user.id) throw new Error("Unauthorized"); patients.splice(index,1); return { success: true };
  }),
});
