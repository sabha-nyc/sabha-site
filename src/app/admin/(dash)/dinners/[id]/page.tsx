import Link from "next/link";
import { notFound } from "next/navigation";
import { DinnerForm } from "@/components/admin/DinnerForm";
import { dinnerById } from "@/lib/dinners";

export const dynamic = "force-dynamic";

export default async function EditDinner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dinner = await dinnerById(id);
  if (!dinner) notFound();

  return (
    <div className="body">
      <h1>{dinner.title}</h1>
      <p className="subline">
        <Link className="crumb" href={`/admin/dinners/${dinner.id}/guests`}>
          Guest list
        </Link>
      </p>
      <DinnerForm dinner={dinner} />
    </div>
  );
}
