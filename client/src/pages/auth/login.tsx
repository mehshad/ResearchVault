import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { login, loginAsDemo, loading, isAuthenticated, authConfig } = useAuth();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Parse any error from the OIDC callback redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    if (err) setErrorMsg(decodeURIComponent(err));
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  const onSubmit = async (values: z.infer<typeof loginSchema>) => {
    setErrorMsg(null);
    const success = await login(values.username, values.password);
    if (success) navigate('/');
  };

  const handleDemoSignIn = async (username: string) => {
    setErrorMsg(null);
    const success = await loginAsDemo(username);
    if (success) navigate('/');
  };

  const handleOidcLogin = () => {
    window.location.href = '/api/auth/oidc';
  };

  const isFormMode = authConfig.mode === 'local' || authConfig.mode === 'ldap';
  const providerName = authConfig.providerName ?? 'SSO';

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            ResearchVault
          </CardTitle>
          <CardDescription className="text-center">
            {isFormMode
              ? 'Sign in with your ' + (authConfig.mode === 'ldap' ? 'institutional ' : '') + 'credentials'
              : `Sign in via ${providerName}`}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {errorMsg && (
            <div className="mb-4 rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
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
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter your username"
                          autoComplete="username"
                          data-1p-ignore="true"
                          data-lpignore="true"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Enter your password"
                          autoComplete="current-password"
                          data-1p-ignore="true"
                          data-lpignore="true"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign in'}
                </Button>
              </form>
            </Form>
          )}

          {authConfig.mode === 'oidc' && (
            <Button className="w-full" onClick={handleOidcLogin} disabled={loading}>
              Sign in with {providerName}
            </Button>
          )}

          {/* Demo instance: sign in as a seeded account with no password. */}
          {authConfig.demoLogin && authConfig.demoAccounts.length > 0 && (
            <div className="mt-6 border-t pt-4">
              <p className="mb-2 text-sm font-medium text-muted-foreground">Or explore the demo as:</p>
              <div className="grid gap-2">
                {authConfig.demoAccounts.map((account) => (
                  <Button
                    key={account.username}
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => handleDemoSignIn(account.username)}
                    disabled={loading}
                    data-testid={`button-demo-${account.username}`}
                  >
                    <span>{account.name}</span>
                    <span className="text-xs text-muted-foreground">{account.role}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-center">
          <p className="text-sm text-muted-foreground">
            Contact your administrator if you need access
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
