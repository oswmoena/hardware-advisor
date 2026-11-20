import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <h1>No encontramos esa página</h1>
      <p>
        Puede que el chip aún no esté en la base de datos. <Link href="/">Vuelve al inicio</Link> y búscalo por su modelo.
      </p>
    </>
  );
}
