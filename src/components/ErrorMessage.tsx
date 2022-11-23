export default function ErrorMessage({
  error,
}: {
  error: { message: string } | null;
}) {
  if (!error) return null;

  // Tailwind box error
  return (
    <div
      className="relative rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700"
      role="alert"
    >
      <strong className="font-bold">Error!</strong>
      <span className="block sm:inline">{error.message}</span>
    </div>
  );
}
