import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MyTrainingClient } from "./MyTrainingClient";

export default async function MyTrainingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  return <MyTrainingClient />;
}
