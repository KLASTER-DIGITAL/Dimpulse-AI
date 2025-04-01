import { FC } from "react";

interface EmptyStateProps {
  greeting?: string;
}

const EmptyState: FC<EmptyStateProps> = ({ greeting = "Добрый день" }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="text-center mb-32">
        <h1 className="text-4xl font-semibold mb-2">{greeting}, Leads.</h1>
        <p className="text-base text-gray-300">Чем я могу помочь сегодня?</p>
      </div>
    </div>
  );
};

export default EmptyState;