import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';

export function LoadingRows({ label }: { label: string }) {
  return (
    <div role='status' aria-label={label} className='space-y-2'>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className='h-10 w-full' />
      ))}
    </div>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert variant='destructive' role='alert'>
      <AlertDescription className='flex items-center justify-between gap-4'>
        {message}
        <Button variant='outline' size='sm' onClick={onRetry}>
          Reintentar
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <Empty className='border'>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
