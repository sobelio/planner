import { type PropsWithChildren } from "react";

type Props = PropsWithChildren<{
  title?: string;
  wide?: boolean;
}>;

export default function Sheet({ children, title, wide }: Props) {
  // A sheet is a container that is used to display content in a card-like format.
  const titleEl = title ? (
    <h1 className="text-2xl font-bold">{title}</h1>
  ) : null;
  const wideClass = wide ? "w-full" : "";
  return (
    <div
      className={`overflow-hidden rounded-lg bg-white shadow ${wideClass} p-4`}
    >
      {titleEl}
      {children}
    </div>
  );
}
