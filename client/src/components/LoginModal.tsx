import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function LoginModal({ open, onOpenChange, onSuccess }: LoginModalProps) {
  const { login, loading, authConfig } = useAuth();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Parse OIDC error from URL if present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    if (err) setErrorMsg(decodeURIComponent(err));
  }, []);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  const onSubmit = async (values: z.infer<typeof loginSchema>) => {
    setErrorMsg(null);
    const success = await login(values.username, values.password);
    if (success) {
      form.reset();
      onSuccess();
    } else {
      setErrorMsg('Invalid username or password');
    }
  };

  const handleOidcLogin = () => {
    window.location.href = '/api/auth/oidc';
  };

  const isFormMode = authConfig.mode === 'local' || authConfig.mode === 'ldap';
  const providerName = authConfig.providerName ?? 'SSO';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">Sign in</DialogTitle>
          <DialogDescription className="text-slate-400">
            {isFormMode
              ? authConfig.mode === 'ldap'
                ? 'Sign in with your institutional credentials'
                : 'Sign in to access Q-BRIDGE'
              : `Sign in via ${providerName}`}
          </DialogDescription>
        </DialogHeader>

        {errorMsg && (
          <div className="rounded-md bg-red-500/10 border border-red-500/20 px-4 py-2 text-sm text-red-400">
            {errorMsg}
          </div>
        )}

        {isFormMode && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Username</FormLabel>
                    <FormControl>
                      <Input
                        className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 dark:placeholder:text-slate-400"
                        placeholder="Enter your username"
                        autoComplete="username"
                        data-1p-ignore="true"
                        data-lpignore="true"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 dark:placeholder:text-slate-400"
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        data-1p-ignore="true"
                        data-lpignore="true"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-500" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </Form>
        )}

        {authConfig.mode === 'oidc' && (
          <Button className="w-full bg-teal-600 hover:bg-teal-500" onClick={handleOidcLogin} disabled={loading}>
            Sign in with {providerName}
          </Button>
        )}

        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          Contact your administrator if you need access
        </p>
      </DialogContent>
    </Dialog>
  );
}
