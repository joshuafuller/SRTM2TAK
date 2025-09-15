/**
 * Notification Manager for displaying user feedback
 */

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface NotificationOptions {
  type?: NotificationType;
  duration?: number;
  persistent?: boolean;
  action?: {
    label: string;
    callback: () => void;
  };
}

export class NotificationManager {
  private container: HTMLElement | null = null;
  private notifications: Map<string, HTMLElement> = new Map();
  private idCounter = 0;
  
  constructor() {
    this.initContainer();
  }
  
  /**
   * Initialize notification container
   */
  private initContainer(): void {
    this.container = document.getElementById('notifications');
    if (!this.container) {
      console.warn('Notification container not found');
    }
  }
  
  /**
   * Show a notification
   */
  show(
    message: string,
    options: NotificationOptions = {}
  ): string {
    if (!this.container) {
      console.warn('Cannot show notification: container not found');
      return '';
    }
    
    const id = `notification-${++this.idCounter}`;
    const type = options.type || 'info';
    const duration = options.persistent ? 0 : (options.duration || 5000);
    
    // Create notification element
    const notification = document.createElement('div');
    notification.id = id;
    notification.className = `notification ${type}`;
    notification.setAttribute('role', 'alert');
    
    // Add icon
    const icon = this.getIcon(type);
    if (icon) {
      const iconElement = document.createElement('div');
      iconElement.className = 'notification-icon';
      iconElement.innerHTML = icon;
      notification.appendChild(iconElement);
    }
    
    // Add content
    const content = document.createElement('div');
    content.className = 'notification-content';
    
    const messageElement = document.createElement('div');
    messageElement.className = 'notification-message';
    messageElement.textContent = message;
    content.appendChild(messageElement);
    
    // Add action button if provided
    if (options.action) {
      const actionButton = document.createElement('button');
      actionButton.className = 'notification-action';
      actionButton.textContent = options.action.label;
      actionButton.onclick = () => {
        options.action!.callback();
        this.dismiss(id);
      };
      content.appendChild(actionButton);
    }
    
    notification.appendChild(content);
    
    // Add close button
    const closeButton = document.createElement('button');
    closeButton.className = 'notification-close';
    closeButton.innerHTML = '×';
    closeButton.onclick = () => this.dismiss(id);
    notification.appendChild(closeButton);
    
    // Add to container
    this.container.appendChild(notification);
    this.notifications.set(id, notification);
    
    // Trigger animation
    requestAnimationFrame(() => {
      notification.classList.add('show');
    });
    
    // Auto-dismiss if not persistent
    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }
    
    return id;
  }
  
  /**
   * Dismiss a notification
   */
  dismiss(id: string): void {
    const notification = this.notifications.get(id);
    if (!notification) return;
    
    // Fade out
    notification.classList.remove('show');
    notification.classList.add('hide');
    
    // Remove after animation
    setTimeout(() => {
      notification.remove();
      this.notifications.delete(id);
    }, 300);
  }
  
  /**
   * Dismiss all notifications
   */
  dismissAll(): void {
    this.notifications.forEach((_, id) => this.dismiss(id));
  }
  
  /**
   * Get icon for notification type
   */
  private getIcon(type: NotificationType): string {
    switch (type) {
      case 'success':
        return '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M9 16.2l-3.6-3.6L4 14l5 5 10-10-1.4-1.4L9 16.2z" fill="currentColor"/></svg>';
      case 'error':
        return '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/></svg>';
      case 'warning':
        return '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" fill="currentColor"/></svg>';
      case 'info':
      default:
        return '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" fill="currentColor"/></svg>';
    }
  }
  
  // Convenience methods
  info(message: string, options?: NotificationOptions): string {
    return this.show(message, { ...options, type: 'info' });
  }
  
  success(message: string, options?: NotificationOptions): string {
    return this.show(message, { ...options, type: 'success' });
  }
  
  warning(message: string, options?: NotificationOptions): string {
    return this.show(message, { ...options, type: 'warning' });
  }
  
  error(message: string, options?: NotificationOptions): string {
    return this.show(message, { ...options, type: 'error' });
  }
}

// Export singleton instance
export const notifications = new NotificationManager();