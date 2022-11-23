export default function LoadingIndicator({ loading }: { loading: boolean }) {
  if (!loading) {
    return null;
  }
  return (
    <div className="flex items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-900"></div>
    </div>
  );
}
