import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const FieldSchema = z.object({
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

const CreateTemplateSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["GENERAL", "TREATMENT"]),
  treatmentType: z.string().optional(),
  description: z.string().optional(),
  introText: z.string().optional(),
  consentText: z.string().optional(),
  fields: z.array(FieldSchema).default([]),
});

function allowedRole(role: string) {
  return ["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const templates = await prisma.consentFormTemplate.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { fields: true, requests: true } } },
  });

  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const role = (session.user as any).role as string;
  if (!allowedRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = CreateTemplateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { fields, ...templateData } = parsed.data;

  const template = await prisma.consentFormTemplate.create({
    data: {
      ...templateData,
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
    },
    include: { fields: { orderBy: { order: "asc" } } },
  });

  return NextResponse.json(template, { status: 201 });
}
