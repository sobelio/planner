import { type PropsWithChildren } from "react";

type Props = PropsWithChildren<Record<string, unknown>>;

export default function Layout({ children }: Props) {
  return (
    <div className="bg-gray-50 md:pt-20">
      <div className="container mx-auto flex min-h-screen flex-col items-center gap-1 p-4">
        {children}
      </div>
    </div>
  );
}
