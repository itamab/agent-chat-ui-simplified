import { v4 as uuidv4 } from "uuid";
import { ReactNode, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useStreamContext } from "@/providers/Stream";
import { useState, FormEvent } from "react";
import { Button } from "../ui/button";
import { Checkpoint, Message } from "@langchain/langgraph-sdk";
import { DO_NOT_RENDER_ID_PREFIX, ensureToolCallsHaveResponses} from "@/lib/ensure-tool-responses";
import { LoaderCircle } from "lucide-react";
import { useQueryState, parseAsBoolean } from "nuqs";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { toast } from "sonner";
import { Fragment } from "react/jsx-runtime";
import { LoadExternalComponent } from "@langchain/langgraph-sdk/react-ui";
import { getContentString } from "./utils";
import { WeatherComponent } from "../ui/weather";

const clientComponents = {
  weather: WeatherComponent,
};

function CustomComponent({message, thread}: {
  message: Message;
  thread: ReturnType<typeof useStreamContext>;
}) {
  const { values } = useStreamContext();
  const customComponents = values.ui?.filter((ui) => ui.metadata?.message_id === message.id);  
  if (!customComponents?.length) return null;
  
  return (
    <Fragment key={message.id}>
      {customComponents.map((customComponent) => (
        <LoadExternalComponent
          key={customComponent.id}
          stream={thread}
          message={customComponent}          
          components={clientComponents}
        />
      ))}
    </Fragment>
  );
}

function StickyToBottomContent(props: {
  content: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const context = useStickToBottomContext();
  return (
    <div
      ref={context.scrollRef}
      style={{ width: "100%", height: "100%" }}
      className={props.className}
    >
      <div ref={context.contentRef} className={props.contentClassName}>
        {props.content}
      </div>

      {props.footer}
    </div>
  );
}

export function Thread() {  
  const [hideToolCalls, setHideToolCalls] = useQueryState(
    "hideToolCalls",
    parseAsBoolean.withDefault(false),
  );
  const [input, setInput] = useState("");
  const [firstTokenReceived, setFirstTokenReceived] = useState(false);  

  const stream = useStreamContext();
  const messages = stream.messages;
  const isLoading = stream.isLoading;

  const lastError = useRef<string | undefined>(undefined);

  // handle loading errors
  useEffect(() => {
    
    if (!stream.error) {
      lastError.current = undefined;
      return;
    }

    try {
      
      const message = (stream.error as any).message;
      
      if (!message || lastError.current === message) {
        // Message has already been logged. do not modify ref, return early.
        return;
      }

      // Message is defined, and it has not been logged yet. Save it, and send the error
      lastError.current = message;
      
      toast.error("An error occurred. Please try again.", {
        description: (
          <p>
            <strong>Error:</strong> <code>{message}</code>
          </p>
        ),
        richColors: true,
        closeButton: true,
      });
    } catch {
      // no-op
    }
  }, [stream.error]);

  // TODO: this should be part of the useStream hook
  const prevMessageLength = useRef(0);
  
  useEffect(() => {
    if (
      messages.length !== prevMessageLength.current &&
      messages?.length &&
      messages[messages.length - 1].type === "ai"
    ) {
      setFirstTokenReceived(true);
    }

    prevMessageLength.current = messages.length;
  }, [messages]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    setFirstTokenReceived(false);

    const newHumanMessage: Message = {
      id: uuidv4(),
      type: "human",
      content: input,
    };

    const toolMessages = ensureToolCallsHaveResponses(stream.messages);

    stream.submit(
      { messages: [...toolMessages, newHumanMessage] },
      {
        streamMode: ["values"],
        optimisticValues: (prev) => ({
          ...prev,
          messages: [
            ...(prev.messages ?? []),
            ...toolMessages,
            newHumanMessage,
          ],
        }),
      },
    );

    setInput("");
  };

  const handleRegenerate = (
    parentCheckpoint: Checkpoint | null | undefined,
  ) => {
    // Do this so the loading state is correct
    prevMessageLength.current = prevMessageLength.current - 1;
    setFirstTokenReceived(false);
    stream.submit(undefined, {
      checkpoint: parentCheckpoint,
      streamMode: ["values"],
    });
  };

  const hasNoAIOrToolMessages = !messages.find(
    (m) => m.type === "ai" || m.type === "tool",
  );

  return (
    <div className="flex w-full h-screen overflow-hidden">
      <motion.div
        className={cn("flex-1 flex flex-col min-w-0 overflow-hidden relative", false)}
        layout={true}
        animate={{marginLeft: 0, width: "100%"}}
        transition={{ duration: 0 }}
      >
        <StickToBottom className="relative flex-1 overflow-hidden">
          <StickyToBottomContent
            
            className={cn(
              "absolute px-4 inset-0 overflow-y-scroll [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-transparent",
              false,
              "grid grid-rows-[1fr_auto]",
            )}

            contentClassName="pt-8 pb-16  max-w-3xl mx-auto flex flex-col gap-4 w-full"
            
            content={
              <>
                {messages.filter((m) => !m.id?.startsWith(DO_NOT_RENDER_ID_PREFIX)).map(
                  (message, index) => message.type === "human" ? (
                      <div key={message.id || `${message.type}-${index}`}>                        
                        <p className="align-right px-4 py-2 rounded-3xl bg-muted w-fit ml-auto whitespace-pre-wrap">
                          {getContentString(message.content)}
                        </p>
                      </div>
                    ) : (                      
                      <CustomComponent message={message} thread={stream} key={message.id || `${message.type}-${index}`}/>                      
                    ),
                  )}                
              </>
            }

            footer={ //input box and send button
              <div className="sticky flex flex-col items-center gap-8 bottom-0 bg-white">

                <div className="bg-muted rounded-2xl border shadow-xs mx-auto mb-8 w-full max-w-3xl relative z-10">
                  <form
                    onSubmit={handleSubmit}
                    className="grid grid-rows-[1fr_auto] gap-2 max-w-3xl mx-auto"
                  >
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !e.metaKey &&
                          !e.nativeEvent.isComposing
                        ) {
                          e.preventDefault();
                          const el = e.target as HTMLElement | undefined;
                          const form = el?.closest("form");
                          form?.requestSubmit();
                        }
                      }}
                      placeholder="Type your message..."
                      className="p-3.5 pb-0 border-none bg-transparent field-sizing-content shadow-none ring-0 outline-none focus:outline-none focus:ring-0 resize-none"
                    />

                    <div className="flex items-center justify-between p-2 pt-4">
                      {stream.isLoading ? (
                        <Button key="stop" onClick={() => stream.stop()}>
                          <LoaderCircle className="w-4 h-4 animate-spin" />
                          Cancel
                        </Button>
                      ) : (
                        <Button
                          type="submit"
                          className="transition-all shadow-md"
                          disabled={isLoading || !input.trim()}
                        >
                          Send
                        </Button>
                      )}
                    </div>
                  </form>
                </div>
              </div>
            }
          />
        </StickToBottom>
      </motion.div>
    </div>
  );
}
