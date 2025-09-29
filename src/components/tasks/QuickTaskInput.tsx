// QuickTaskInput.tsx
import React, { useState, useRef, useCallback } from 'react';
import { Mic, StopCircle, Plus, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

interface QuickTaskInputProps {
  onAddTask: (title: string, data: { due_date: string; assignee_id: string | null; }) => Promise<any>;
  defaultAssigneeId?: string;
}

const formatDate = (date: Date): string => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export function QuickTaskInput({ onAddTask, defaultAssigneeId }: QuickTaskInputProps) {
  const [title, setTitle] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const recognitionRef = useRef<any>(null);
  const { toast } = useToast();

  const startRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({
        title: 'Browser Not Supported',
        description: 'Your browser does not support the Web Speech API. Try Chrome.',
        variant: 'destructive',
      });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsRecording(true);
      setTitle('');
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setTitle(transcript);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopRecording = () => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setIsLoading(true);
    try {
      // Prefill due date and assignee
      const today = formatDate(new Date());
      await onAddTask(title, {
        due_date: today,
        // Replace with your actual logged-in user ID
        assignee_id: defaultAssigneeId || 'default-user-id-here',
      });
      setTitle('');
      toast({
        title: 'Task Created',
        description: 'New task added successfully.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create task.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Input
          type="text"
          placeholder="Start speaking or type to add a new task..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          className="pr-10"
          disabled={isLoading}
        />
        <Button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          variant="ghost"
          size="sm"
          className="absolute right-1 top-1/2 -translate-y-1/2 px-2 py-0 h-auto"
          disabled={isLoading}
        >
          {isRecording ? <StopCircle className="h-4 w-4 text-red-500" /> : <Mic className="h-4 w-4" />}
        </Button>
      </div>
      <Button onClick={handleSubmit} disabled={!title.trim() || isLoading}>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      </Button>
    </div>
  );
}