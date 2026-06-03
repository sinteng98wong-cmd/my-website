import { prisma } from "./prisma";

export async function seedExpenseCategories() {
  const categories = [
    { name: "Lab Fees",               order: 1 },
    { name: "Dental Materials",        order: 2 },
    { name: "Rental",                  order: 3 },
    { name: "Utilities",               order: 4 },
    { name: "Pest Control",            order: 5 },
    { name: "Waste Disposal",          order: 6 },
    { name: "Professional Services",   order: 7 },
    { name: "Maintenance",             order: 8 },
    { name: "Inter-branch Charges",    order: 9 },
    { name: "Other",                   order: 10 },
  ];

  for (const cat of categories) {
    await prisma.expenseCategory.upsert({
      where: { name: cat.name },
      update: {},
      create: cat,
    });
  }
}
