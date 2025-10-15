import React from 'react';
import ChatInterface from '../components/chat/ChatInterface'; // default import

const QuantChat = () => {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">QuantChat AI Assistant</h1>
      <p className="text-gray-600 mb-6">
        Your intelligent assistant for financial queries and insights.
      </p>
      <ChatInterface />
    </div>
  );
};

export default QuantChat;
