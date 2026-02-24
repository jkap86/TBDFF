import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="space-y-6 text-center">
        <h1 className="text-3xl font-bold">TBDFF</h1>
        <p className="text-gray-600 dark:text-gray-400">Fantasy Football</p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Register
          </Link>
        </div>
      </div>
    </div>
  );
}
