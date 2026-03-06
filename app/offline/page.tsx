export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-center">
      <div className="surface max-w-lg space-y-3 p-8">
        <h1 className="text-2xl font-bold">You are offline</h1>
        <p className="text-sm text-white/80">
          You can continue creating and saving closings. Changes will sync when your
          connection returns.
        </p>
      </div>
    </main>
  );
}
