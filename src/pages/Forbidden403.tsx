import React from 'react';

export default function Forbidden403() {
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-bold mb-2">403 • Forbidden</h1>
        <p className="text-gray-600">You don’t have permission to view this page.</p>
      </div>
    </div>
  );
}
