import { DinnerForm } from "@/components/admin/DinnerForm";

export const dynamic = "force-dynamic";

export default function NewDinner() {
  return (
    <div className="body">
      <h1>New dinner</h1>
      <p className="subline">It starts as a draft. Nothing is reachable until the status is open.</p>
      <DinnerForm />
    </div>
  );
}
