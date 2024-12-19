import React from 'react';
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface ChatOutputProps {
  content: string;
}

const EnhancedChatOutput: React.FC<ChatOutputProps> = ({ content }) => {
  const renderContent = (text: string) => {
    const parts = text.split(/(<.*?>)/);
    return parts.map((part, index) => {
      if (part.startsWith('<response>')) {
        return (
          <Card key={index} className="bg-blue-100 p-4 mb-4 rounded-lg">
            <h3 className="text-blue-800 font-semibold mb-2">Response:</h3>
            <p className="text-blue-700">{part.replace(/<\/?response>/g, '')}</p>
          </Card>
        );
      } else if (part.startsWith('<action>')) {
        return (
          <Card key={index} className="bg-purple-100 p-4 mb-4 rounded-lg">
            <h3 className="text-purple-800 font-semibold mb-2">Action:</h3>
            <p className="text-purple-700">{part.replace(/<\/?action>/g, '')}</p>
          </Card>
        );
      } else if (part.startsWith('<thinking>')) {
        return (
          <Card key={index} className="bg-green-100 p-4 mb-4 rounded-lg">
            <h3 className="text-green-800 font-semibold mb-2">Thinking:</h3>
            <p className="text-green-700">{part.replace(/<\/?thinking>/g, '')}</p>
          </Card>
        );
      } else if (part.startsWith('<execute_python>')) {
        const code = part.replace(/<\/?execute_python>/g, '').trim();
        return (
          <Card key={index} className="bg-gray-800 p-4 mb-4 rounded-lg">
            <h3 className="text-gray-200 font-semibold mb-2">Python Execution:</h3>
            <SyntaxHighlighter language="python" style={vscDarkPlus}>
              {code}
            </SyntaxHighlighter>
          </Card>
        );
      } else {
        return <p key={index}>{part}</p>;
      }
    });
  };

  return (
    <ScrollArea className="h-[600px] w-full rounded-md border p-4">
      <div className="space-y-4">
        {renderContent(content)}
      </div>
    </ScrollArea>
  );
};

export default EnhancedChatOutput;
