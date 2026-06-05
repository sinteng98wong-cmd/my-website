import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const FieldSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
  fieldType: z.enum(["TEXT", "LONG_TEXT", "YES_NO", "CHECKBOX", "MULTIPLE_CHOICE", "DATE", "SIGNATURE"]),
  isRequired: z.boolean().default(false),
  order: z.number().int(),
  options: z.array(z.string()).default([]),
  placeholder: z.string().optional(),
  helpText: z.string().optional(),
  showIfFieldId: z.string().optional(),
  showIfValue: z.string().optional(),
});

const PatchTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["GENERAL", "TREATMENT"]).optional(),
  treatmentType: z.string().optional(),
  description: z.string().optional(),
  introText: z.string().optional(),
  consentText: z.string().optional(),
  isActive: z.boolean().optional(),
  fields: z.array(FieldSchema).optional(),
});

function allowedRole(role: string) {
  return ["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role);
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const template = await prisma.consentFormTemplate.findUnique({
    where: { id: params.id },
    include: { fields: { orderBy: { order: "asc" } } },
  });

  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(template);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const role = (session.user as any).role as string;
  if (!allowedRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = PatchTemplateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { fields, ...rest } = parsed.data;

  const existing = await prisma.consentFormTemplate.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const fieldsChanged = fields !== undefined;

  const template = await prisma.$transaction(async (tx) => {
    if (fieldsChanged) {
      await tx.consentFormField.deleteMany({ where: { templateId: params.id } });
    }

    return tx.consentFormTemplate.update({
      where: { id: params.id },
      data: {
        ...rest,
        ...(fieldsChanged ? { version: { increment: 1 } } : {}),
        ...(fields
          ? {
              fields: {
                create: fields.map((f) => ({
                  label: f.label,
                  fieldType: f.fieldType,
                  isRequired: f.isRequired,
                  order: f.order,
                  options: f.options,
                  placeholder: f.placeholder ?? null,
                  helpText: f.helpText ?? null,
                  showIfFieldId: f.showIfFieldId ?? null,
                  showIfValue: f.showIfValue ?? null,
                })),
              },
            }
          : {}),
      },
      include: { fields: { orderBy: { order: "asc" } } },
    });
  });

  return NextResponse.json(template);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const role = (session.user as any).role as string;
  if (!allowedRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const requestCount = await prisma.consentRequest.count({ where: { templateId: params.id } });
  if (requestCount > 0) {
    return NextResponse.json(
      { error: "Cannot delete: template has existing consent requests" },
      { status: 409 }
    );
  }

  await prisma.consentFormField.deleteMany({ where: { templateId: params.id } });
  await prisma.consentFormTemplate.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}
