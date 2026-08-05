export function StorefrontUnavailableState() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8f8f7] px-6 py-16">
      <section className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">
          Gestor Delivery
        </p>
        <h1 className="mt-4 text-2xl font-black tracking-tight text-gray-950">
          Vitrine indisponível neste ambiente
        </h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          Este preview não possui a configuração pública necessária para carregar o restaurante e o cardápio.
        </p>
      </section>
    </main>
  );
}
