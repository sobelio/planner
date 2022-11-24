import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { publicProcedure, router } from "../trpc";

function toIsoDateStr(date: Date) {
  return date.toISOString().substring(0, 10);
}

export const eventsRouter = router({
  getEvent: publicProcedure
    .input(z.object({ id: z.string() }))
    .output(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        options: z.array(
          z.object({
            date: z.string(),
            id: z.string(),
          })
        ),
        responses: z.array(
          z.object({
            respondent: z.object({
              name: z.string().nullable(),
            }),
            selectedOptions: z.array(
              z.object({
                preference: z.number(),
                uncertain: z.boolean(),
                optionId: z.string(),
              })
            ),
          })
        ),
      })
    )
    .query(async ({ input: { id }, ctx: { prisma } }) => {
      if (id === "demo") {
        return {
          id: "demo",
          name: "Demo Event",
          description: "This is a demo event",
          options: [
            { date: toIsoDateStr(new Date()), id: "1" },
            { date: toIsoDateStr(new Date()), id: "2" },
          ],
          responses: [],
        };
      }
      const event = await prisma.event.findUnique({
        where: { id },
        include: {
          options: true,
          responses: {
            include: {
              respondent: true,
              selectedOptions: true,
            },
          },
        },
      });
      if (!event) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Event not found",
        });
      }
      event.options.sort((a, b) => a.date.localeCompare(b.date));
      return event;
    }),
  createEvent: publicProcedure
    .input(
      z.object({
        name: z.string(),
        description: z.string(),
        options: z.array(z.date()),
      })
    )
    .output(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { name, description, options } = input;
      const { id } = await ctx.prisma.event.create({
        data: {
          name,
          description,
          options: {
            create: options.map(toIsoDateStr).map((date) => ({
              date,
            })),
          },
        },
        select: { id: true },
      });
      return { id };
    }),
  addResponse: publicProcedure
    .input(
      z.object({
        eventId: z.string(),
        name: z.string(),
        options: z.array(
          z.object({
            optionId: z.string(),
            uncertain: z.boolean(),
            preference: z.number(),
          })
        ),
      })
    )
    .output(
      z.object({
        id: z.string(),
      })
    )
    .mutation(
      async ({
        input: { eventId, options, name },
        ctx: { prisma, session },
      }) => {
        if (eventId === "demo") {
          return { id: "demo" };
        }
        const user = session?.user;
        let respondentId: string;
        if (user) {
          const userName = user.name ?? user.id;
          const { id } = await prisma.respondent.upsert({
            where: { userId: user.id },
            create: {
              userId: user.id,
              name: userName,
            },
            update: {},
            select: { id: true },
          });
          respondentId = id;
        } else {
          const { id } = await prisma.respondent.create({
            data: {
              name,
            },
            select: { id: true },
          });
          respondentId = id;
        }
        await prisma.event.findFirstOrThrow({ where: { id: eventId } });
        const { id } = await prisma.response.create({
          data: {
            respondentId,
            eventId,
            selectedOptions: {
              create: options.map(({ optionId, uncertain, preference }) => ({
                optionId,
                uncertain,
                preference,
              })),
            },
          },
          select: { id: true },
        });
        return { id };
      }
    ),
});
