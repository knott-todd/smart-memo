import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation } from "wouter";
import { useCreateProject, getListProjectsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AppHeader } from "@/components/app-header";

const formSchema = z.object({
  title: z.string().min(1, "Title is required").max(100),
  description: z.string().optional(),
  projectType: z.enum(["developer", "smb", "creative", "other"]),
});

export default function NewProject() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createProject = useCreateProject();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      projectType: "developer",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    createProject.mutate(
      { data: values },
      {
        onSuccess: (project) => {
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          toast({ title: "Project created" });
          setLocation(`/projects/${project.id}`);
        },
        onError: () => {
          toast({ title: "Failed to create project", variant: "destructive" });
        },
      }
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <AppHeader title="New Project" />
      <main className="flex-1 px-5 py-8 max-w-lg mx-auto w-full">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-widest">Title</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Phoenix Refactor"
                      className="bg-card border-border/50 text-lg font-serif"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-widest">Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="What's the main goal?"
                      className="resize-none bg-card border-border/50"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="projectType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-widest">Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-card border-border/50">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="developer">Developer</SelectItem>
                      <SelectItem value="creative">Creative</SelectItem>
                      <SelectItem value="smb">Business</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-between pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setLocation("/projects")}
                disabled={createProject.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createProject.isPending}>
                {createProject.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create
              </Button>
            </div>
          </form>
        </Form>
      </main>
    </div>
  );
}
